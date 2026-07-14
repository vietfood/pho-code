use std::net::{Ipv4Addr, SocketAddr};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;
use url::Url;
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::backend::profile::CompatibilityProfile;

use super::actor::{RefreshError, RefreshedCredential, TokenRefresher};
use super::{AuthError, CredentialBundle, SecretText};

const MAX_AUTHORIZATION_INPUT_BYTES: usize = 8 * 1024;
const MAX_CALLBACK_REQUEST_BYTES: usize = 12 * 1024;
const MAX_CODE_BYTES: usize = 4 * 1024;
const MAX_STATE_BYTES: usize = 512;

pub trait RandomSource: Send + Sync {
    fn fill(&self, destination: &mut [u8]) -> Result<(), AuthError>;
}

pub struct SystemRandom;

impl RandomSource for SystemRandom {
    fn fill(&self, destination: &mut [u8]) -> Result<(), AuthError> {
        getrandom::fill(destination).map_err(|_| AuthError::CallbackInvalid)
    }
}

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct PkceMaterial {
    verifier: SecretText,
    challenge: String,
    state: SecretText,
}

impl std::fmt::Debug for PkceMaterial {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PkceMaterial")
            .field("verifier", &"[REDACTED]")
            .field("challenge", &"[REDACTED]")
            .field("state", &"[REDACTED]")
            .finish()
    }
}

impl PkceMaterial {
    pub fn generate(random: &dyn RandomSource) -> Result<Self, AuthError> {
        let mut verifier_bytes = [0_u8; 32];
        let mut state_bytes = [0_u8; 32];
        random.fill(&mut verifier_bytes)?;
        random.fill(&mut state_bytes)?;
        let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);
        let challenge = challenge_for_verifier(&verifier);
        let state = URL_SAFE_NO_PAD.encode(state_bytes);
        verifier_bytes.zeroize();
        state_bytes.zeroize();
        Ok(Self {
            verifier: SecretText::new(verifier),
            challenge,
            state: SecretText::new(state),
        })
    }

    pub fn authorization_url(&self, profile: &CompatibilityProfile) -> Result<Url, AuthError> {
        profile
            .validate_candidate()
            .map_err(|_| AuthError::CallbackInvalid)?;
        let mut url = profile.authorization_endpoint.clone();
        {
            let mut query = url.query_pairs_mut();
            query
                .append_pair("response_type", "code")
                .append_pair("client_id", &profile.client_id)
                .append_pair("redirect_uri", profile.redirect_uri.as_str())
                .append_pair("scope", &profile.scopes.join(" "))
                .append_pair("code_challenge", &self.challenge)
                .append_pair("code_challenge_method", "S256")
                .append_pair("state", self.state.expose())
                .append_pair("originator", &profile.originator);
        }
        Ok(url)
    }

    pub(crate) fn verifier(&self) -> &str {
        self.verifier.expose()
    }

    pub fn expected_state(&self) -> &str {
        self.state.expose()
    }
}

pub fn challenge_for_verifier(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

#[derive(Debug)]
pub struct ParsedAuthorization {
    pub code: SecretText,
    pub state_was_validated: bool,
}

pub fn parse_authorization_input(
    input: &str,
    expected_redirect: &Url,
    expected_state: &str,
) -> Result<ParsedAuthorization, AuthError> {
    if input.is_empty() || input.len() > MAX_AUTHORIZATION_INPUT_BYTES {
        return Err(AuthError::CallbackInvalid);
    }
    if input.contains("://") {
        let parsed = Url::parse(input).map_err(|_| AuthError::CallbackInvalid)?;
        if !same_callback(&parsed, expected_redirect) {
            return Err(AuthError::CallbackInvalid);
        }
        return parse_callback_url(&parsed, expected_state);
    }
    if input.len() > MAX_CODE_BYTES
        || input
            .bytes()
            .any(|byte| byte.is_ascii_whitespace() || byte == 0)
    {
        return Err(AuthError::CallbackInvalid);
    }
    Ok(ParsedAuthorization {
        code: SecretText::new(input.to_owned()),
        state_was_validated: false,
    })
}

fn parse_callback_url(url: &Url, expected_state: &str) -> Result<ParsedAuthorization, AuthError> {
    let mut codes = Vec::new();
    let mut states = Vec::new();
    let mut errors = Vec::new();
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => codes.push(value.into_owned()),
            "state" => states.push(value.into_owned()),
            "error" => errors.push(value.into_owned()),
            _ => {}
        }
    }
    if !errors.is_empty() || codes.len() != 1 || states.len() != 1 {
        return Err(AuthError::CallbackInvalid);
    }
    let code = codes.pop().ok_or(AuthError::CallbackInvalid)?;
    let state = states.pop().ok_or(AuthError::CallbackInvalid)?;
    if state.len() > MAX_STATE_BYTES || state.as_bytes() != expected_state.as_bytes() {
        return Err(AuthError::StateMismatch);
    }
    if code.is_empty() || code.len() > MAX_CODE_BYTES {
        return Err(AuthError::CallbackInvalid);
    }
    Ok(ParsedAuthorization {
        code: SecretText::new(code),
        state_was_validated: true,
    })
}

fn same_callback(actual: &Url, expected: &Url) -> bool {
    actual.scheme() == expected.scheme()
        && actual.host_str() == expected.host_str()
        && actual.port_or_known_default() == expected.port_or_known_default()
        && actual.path() == expected.path()
}

pub struct LoopbackCallback {
    listener: TcpListener,
    redirect: Url,
}

impl LoopbackCallback {
    pub async fn bind(redirect: Url) -> Result<Self, AuthError> {
        if redirect.scheme() != "http"
            || !matches!(redirect.host_str(), Some("localhost" | "127.0.0.1"))
        {
            return Err(AuthError::CallbackInvalid);
        }
        let port = redirect.port().ok_or(AuthError::CallbackInvalid)?;
        let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, port)))
            .await
            .map_err(|_| AuthError::CallbackInvalid)?;
        Ok(Self { listener, redirect })
    }

    pub async fn receive(
        self,
        expected_state: &str,
        timeout: Duration,
        cancellation: CancellationToken,
    ) -> Result<ParsedAuthorization, AuthError> {
        let accepted = tokio::select! {
            _ = cancellation.cancelled() => return Err(AuthError::Cancelled),
            result = tokio::time::timeout(timeout, self.listener.accept()) => {
                result.map_err(|_| AuthError::Cancelled)?.map_err(|_| AuthError::CallbackInvalid)?
            }
        };
        let (mut stream, peer) = accepted;
        if !peer.ip().is_loopback() {
            return Err(AuthError::CallbackInvalid);
        }
        let mut bytes = Vec::with_capacity(1024);
        loop {
            if bytes.len() == MAX_CALLBACK_REQUEST_BYTES {
                return Err(AuthError::CallbackInvalid);
            }
            let mut chunk = [0_u8; 1024];
            let count = tokio::select! {
                _ = cancellation.cancelled() => return Err(AuthError::Cancelled),
                result = stream.read(&mut chunk) => result.map_err(|_| AuthError::CallbackInvalid)?,
            };
            if count == 0 {
                break;
            }
            bytes.extend_from_slice(&chunk[..count]);
            if bytes.len() > MAX_CALLBACK_REQUEST_BYTES {
                return Err(AuthError::CallbackInvalid);
            }
            if bytes.windows(4).any(|window| window == b"\r\n\r\n") {
                break;
            }
        }
        let parsed = parse_http_callback(&bytes, &self.redirect, expected_state);
        bytes.zeroize();
        let (status, message) = if parsed.is_ok() {
            (
                "200 OK",
                "Authentication received. You can return to Pho Code.",
            )
        } else {
            (
                "400 Bad Request",
                "Authentication could not be accepted. Return to Pho Code.",
            )
        };
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{message}",
            message.len()
        );
        let _ = stream.write_all(response.as_bytes()).await;
        let _ = stream.shutdown().await;
        parsed
    }
}

fn parse_http_callback(
    bytes: &[u8],
    redirect: &Url,
    expected_state: &str,
) -> Result<ParsedAuthorization, AuthError> {
    let request = std::str::from_utf8(bytes).map_err(|_| AuthError::CallbackInvalid)?;
    let line = request.lines().next().ok_or(AuthError::CallbackInvalid)?;
    let mut parts = line.split_ascii_whitespace();
    if parts.next() != Some("GET") {
        return Err(AuthError::CallbackInvalid);
    }
    let target = parts.next().ok_or(AuthError::CallbackInvalid)?;
    if parts.next().is_none() || parts.next().is_some() {
        return Err(AuthError::CallbackInvalid);
    }
    let actual = redirect
        .join(target)
        .map_err(|_| AuthError::CallbackInvalid)?;
    if !same_callback(&actual, redirect) {
        return Err(AuthError::CallbackInvalid);
    }
    parse_callback_url(&actual, expected_state)
}

pub fn extract_account_id(access_token: &str) -> Result<String, AuthError> {
    if access_token.is_empty() || access_token.len() > 64 * 1024 {
        return Err(AuthError::AccountIdMissing);
    }
    let mut segments = access_token.split('.');
    let _header = segments.next().ok_or(AuthError::AccountIdMissing)?;
    let payload = segments.next().ok_or(AuthError::AccountIdMissing)?;
    if segments.next().is_none() {
        return Err(AuthError::AccountIdMissing);
    }
    let decoded = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| AuthError::AccountIdMissing)?;
    if decoded.len() > 16 * 1024 {
        return Err(AuthError::AccountIdMissing);
    }
    let value: serde_json::Value =
        serde_json::from_slice(&decoded).map_err(|_| AuthError::AccountIdMissing)?;
    let account = value
        .get("https://api.openai.com/auth")
        .and_then(|auth| auth.get("chatgpt_account_id"))
        .and_then(serde_json::Value::as_str)
        .or_else(|| {
            value
                .get("chatgpt_account_id")
                .and_then(serde_json::Value::as_str)
        })
        .ok_or(AuthError::AccountIdMissing)?;
    if account.is_empty() || account.len() > 512 {
        return Err(AuthError::AccountIdMissing);
    }
    Ok(account.to_owned())
}

pub struct OAuthHttpClient {
    client: reqwest::Client,
    profile: CompatibilityProfile,
}

impl OAuthHttpClient {
    pub fn new(profile: CompatibilityProfile) -> Result<Self, AuthError> {
        profile
            .validate_candidate()
            .map_err(|_| AuthError::CallbackInvalid)?;
        let client = reqwest::Client::builder()
            .redirect_policy(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|_| AuthError::CredentialStore)?;
        Ok(Self { client, profile })
    }

    pub async fn exchange_code(
        &self,
        code: &SecretText,
        verifier: &PkceMaterial,
        now_unix_seconds: u64,
    ) -> Result<CredentialBundle, AuthError> {
        let form = [
            ("grant_type", "authorization_code"),
            ("client_id", self.profile.client_id.as_str()),
            ("code", code.expose()),
            ("code_verifier", verifier.verifier()),
            ("redirect_uri", self.profile.redirect_uri.as_str()),
        ];
        let response = self
            .client
            .post(self.profile.token_endpoint.clone())
            .form(&form)
            .send()
            .await
            .map_err(|_| AuthError::CredentialStore)?;
        if !response.status().is_success() {
            return Err(AuthError::CredentialStore);
        }
        let mut bytes = response
            .bytes()
            .await
            .map_err(|_| AuthError::CredentialStore)?
            .to_vec();
        let token = parse_token_response(&bytes, now_unix_seconds);
        bytes.zeroize();
        let token = token?;
        let account_id = extract_account_id(token.access_token.expose())?;
        CredentialBundle::new(
            token.access_token.expose().to_owned(),
            token.refresh_token.expose().to_owned(),
            token.expires_at_unix_seconds,
            account_id,
            self.profile.revision,
        )
    }
}

impl TokenRefresher for OAuthHttpClient {
    fn refresh<'a>(
        &'a self,
        refresh_token: &'a SecretText,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<Output = Result<RefreshedCredential, RefreshError>> + Send + 'a,
        >,
    > {
        Box::pin(async move {
            let form = [
                ("grant_type", "refresh_token"),
                ("client_id", self.profile.client_id.as_str()),
                ("refresh_token", refresh_token.expose()),
            ];
            let response = self
                .client
                .post(self.profile.token_endpoint.clone())
                .form(&form)
                .send()
                .await
                .map_err(|_| RefreshError::Transient)?;
            if response.status().as_u16() == 400 || response.status().as_u16() == 401 {
                return Err(RefreshError::InvalidGrant);
            }
            if !response.status().is_success() {
                return Err(RefreshError::Transient);
            }
            let mut bytes = response
                .bytes()
                .await
                .map_err(|_| RefreshError::Transient)?
                .to_vec();
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_secs())
                .unwrap_or(0);
            let parsed = parse_token_response(&bytes, now).map_err(|_| RefreshError::Malformed);
            bytes.zeroize();
            parsed
        })
    }
}

#[derive(serde::Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
}

fn parse_token_response(
    bytes: &[u8],
    now_unix_seconds: u64,
) -> Result<RefreshedCredential, AuthError> {
    if bytes.len() > 128 * 1024 {
        return Err(AuthError::CredentialsMalformed);
    }
    let response: TokenResponse =
        serde_json::from_slice(bytes).map_err(|_| AuthError::CredentialsMalformed)?;
    let refresh_token = response
        .refresh_token
        .ok_or(AuthError::CredentialsMalformed)?;
    if response.access_token.is_empty()
        || response.access_token.len() > 64 * 1024
        || refresh_token.is_empty()
        || refresh_token.len() > 64 * 1024
        || response.expires_in == 0
        || response.expires_in > 31 * 24 * 60 * 60
    {
        return Err(AuthError::CredentialsMalformed);
    }
    Ok(RefreshedCredential {
        access_token: SecretText::new(response.access_token),
        refresh_token: SecretText::new(refresh_token),
        expires_at_unix_seconds: now_unix_seconds.saturating_add(response.expires_in),
    })
}

#[derive(Debug)]
pub enum DevicePollResult {
    Pending,
    SlowDown,
    Authorized {
        code: SecretText,
        verifier: SecretText,
    },
    Denied,
    Expired,
}

pub fn parse_device_poll_response(
    status: u16,
    bytes: &[u8],
) -> Result<DevicePollResult, AuthError> {
    if bytes.len() > 64 * 1024 {
        return Err(AuthError::CallbackInvalid);
    }
    let value: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|_| AuthError::CallbackInvalid)?;
    if status == 200 {
        let code = value
            .get("authorization_code")
            .and_then(serde_json::Value::as_str)
            .ok_or(AuthError::CallbackInvalid)?;
        let verifier = value
            .get("code_verifier")
            .and_then(serde_json::Value::as_str)
            .ok_or(AuthError::CallbackInvalid)?;
        if code.is_empty()
            || code.len() > MAX_CODE_BYTES
            || verifier.is_empty()
            || verifier.len() > MAX_CODE_BYTES
        {
            return Err(AuthError::CallbackInvalid);
        }
        return Ok(DevicePollResult::Authorized {
            code: SecretText::new(code.into()),
            verifier: SecretText::new(verifier.into()),
        });
    }
    let error = value
        .get("error")
        .and_then(serde_json::Value::as_str)
        .ok_or(AuthError::CallbackInvalid)?;
    match error {
        "authorization_pending" => Ok(DevicePollResult::Pending),
        "slow_down" => Ok(DevicePollResult::SlowDown),
        "access_denied" | "authorization_declined" => Ok(DevicePollResult::Denied),
        "expired_token" | "authorization_expired" => Ok(DevicePollResult::Expired),
        _ => Err(AuthError::CallbackInvalid),
    }
}

#[cfg(test)]
mod tests {
    use std::net::TcpListener as StdTcpListener;

    use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
    use tokio::net::TcpStream;

    use super::*;

    fn available_redirect() -> Url {
        let listener = StdTcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        Url::parse(&format!("http://localhost:{port}/auth/callback")).unwrap()
    }

    #[test]
    fn rfc_7636_challenge_matches() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            challenge_for_verifier(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn callback_requires_exact_path_state_and_single_code() {
        let redirect = Url::parse("http://localhost:1455/auth/callback").unwrap();
        let valid = parse_authorization_input(
            "http://localhost:1455/auth/callback?code=abc&state=expected",
            &redirect,
            "expected",
        )
        .unwrap();
        assert!(valid.state_was_validated);
        assert!(matches!(
            parse_authorization_input(
                "http://localhost:1455/wrong?code=abc&state=expected",
                &redirect,
                "expected"
            ),
            Err(AuthError::CallbackInvalid)
        ));
        assert!(matches!(
            parse_authorization_input(
                "http://localhost:1455/auth/callback?code=a&code=b&state=expected",
                &redirect,
                "expected"
            ),
            Err(AuthError::CallbackInvalid)
        ));
        assert!(matches!(
            parse_authorization_input(
                "http://localhost:1455/auth/callback?code=a&state=wrong",
                &redirect,
                "expected"
            ),
            Err(AuthError::StateMismatch)
        ));
    }

    #[test]
    fn bare_code_is_explicitly_unvalidated() {
        let redirect = Url::parse("http://localhost:1455/auth/callback").unwrap();
        let parsed = parse_authorization_input("bare-code", &redirect, "expected").unwrap();
        assert!(!parsed.state_was_validated);
    }

    #[test]
    fn account_claim_is_bounded_and_unverified_metadata() {
        let payload = URL_SAFE_NO_PAD
            .encode(br#"{"https://api.openai.com/auth":{"chatgpt_account_id":"account-fixture"}}"#);
        let token = format!("header.{payload}.signature");
        assert_eq!(extract_account_id(&token).unwrap(), "account-fixture");
        assert!(extract_account_id("malformed").is_err());
    }

    #[test]
    fn device_states_are_not_inferred_from_status_alone() {
        assert!(matches!(
            parse_device_poll_response(403, br#"{"error":"authorization_pending"}"#).unwrap(),
            DevicePollResult::Pending
        ));
        assert!(matches!(
            parse_device_poll_response(400, br#"{"error":"slow_down"}"#).unwrap(),
            DevicePollResult::SlowDown
        ));
        assert!(matches!(
            parse_device_poll_response(403, br#"{"error":"access_denied"}"#).unwrap(),
            DevicePollResult::Denied
        ));
        assert!(matches!(
            parse_device_poll_response(404, br#"{"error":"expired_token"}"#).unwrap(),
            DevicePollResult::Expired
        ));
        assert!(parse_device_poll_response(403, br#"{"error":"unexpected"}"#).is_err());
    }

    #[tokio::test]
    async fn loopback_accepts_one_valid_callback() {
        let redirect = available_redirect();
        let callback = LoopbackCallback::bind(redirect.clone()).await.unwrap();
        let port = redirect.port().unwrap();
        let client = tokio::spawn(async move {
            let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
                .await
                .unwrap();
            stream.write_all(b"GET /auth/callback?code=fixture&state=expected HTTP/1.1\r\nHost: localhost\r\n\r\n").await.unwrap();
            let mut response = Vec::new();
            stream.read_to_end(&mut response).await.unwrap();
            response
        });
        let parsed = callback
            .receive("expected", Duration::from_secs(1), CancellationToken::new())
            .await
            .unwrap();
        assert!(parsed.state_was_validated);
        assert!(
            String::from_utf8(client.await.unwrap())
                .unwrap()
                .starts_with("HTTP/1.1 200 OK")
        );
    }

    #[tokio::test]
    async fn occupied_port_timeout_and_cancellation_are_visible() {
        let listener = StdTcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let redirect = Url::parse(&format!("http://localhost:{port}/auth/callback")).unwrap();
        assert!(LoopbackCallback::bind(redirect).await.is_err());
        drop(listener);

        let callback = LoopbackCallback::bind(available_redirect()).await.unwrap();
        assert!(matches!(
            callback
                .receive("state", Duration::from_millis(5), CancellationToken::new())
                .await,
            Err(AuthError::Cancelled)
        ));

        let redirect = available_redirect();
        let callback = LoopbackCallback::bind(redirect.clone()).await.unwrap();
        let cancellation = CancellationToken::new();
        cancellation.cancel();
        assert!(matches!(
            callback
                .receive("state", Duration::from_secs(1), cancellation)
                .await,
            Err(AuthError::Cancelled)
        ));
        assert!(
            TcpStream::connect((Ipv4Addr::LOCALHOST, redirect.port().unwrap()))
                .await
                .is_err()
        );
    }

    #[test]
    fn token_response_requires_complete_bounded_fields() {
        assert!(
            parse_token_response(
                br#"{"access_token":"a","refresh_token":"r","expires_in":3600}"#,
                100
            )
            .is_ok()
        );
        assert!(parse_token_response(br#"{"access_token":"a","expires_in":3600}"#, 100).is_err());
        assert!(
            parse_token_response(
                br#"{"access_token":"a","refresh_token":"r","expires_in":0}"#,
                100
            )
            .is_err()
        );
    }
}
