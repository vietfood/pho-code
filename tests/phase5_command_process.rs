use std::io::{Read as _, Write as _};
use std::process::{Command, Stdio};
use std::thread;

fn pho() -> Command {
    Command::new(env!("CARGO_BIN_EXE_pho"))
}

fn read_request(stream: &mut std::net::TcpStream) {
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 4096];
    loop {
        let count = stream.read(&mut buffer).unwrap();
        if count == 0 {
            return;
        }
        bytes.extend_from_slice(&buffer[..count]);
        let Some(headers_end) = bytes.windows(4).position(|window| window == b"\r\n\r\n") else {
            continue;
        };
        let headers_end = headers_end + 4;
        let headers = String::from_utf8_lossy(&bytes[..headers_end]);
        let content_length = headers
            .lines()
            .find_map(|line| {
                line.to_ascii_lowercase()
                    .strip_prefix("content-length: ")
                    .and_then(|value| value.trim().parse::<usize>().ok())
            })
            .unwrap();
        if bytes.len() >= headers_end + content_length {
            return;
        }
    }
}

#[test]
fn durable_chat_lists_and_resumes_by_opaque_id_without_a_journal_path() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        read_request(&mut stream);
        let body = concat!(
            "data: {\"id\":\"phase5-command\",\"model\":\"deepseek-v4-flash\",",
            "\"choices\":[{\"index\":0,\"delta\":{\"content\":\"durable-answer\"},",
            "\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":1,",
            "\"prompt_cache_hit_tokens\":0,\"prompt_cache_miss_tokens\":1,",
            "\"completion_tokens\":1,\"total_tokens\":2}}\n\n",
            "data: [DONE]\n\n"
        );
        write!(
            stream,
            "HTTP/1.1 200 fixture\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .unwrap();
    });
    let home = tempfile::tempdir().unwrap();
    let workspace = tempfile::tempdir().unwrap();
    let mut chat = pho();
    chat.args(["chat", "--stdin"])
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .env("PHO_CODE_TEST_MEMORY_CREDENTIALS", "ready")
        .env("PHO_CODE_TEST_PHASE5_SESSION", "1")
        .env(
            "PHO_CODE_TEST_CHAT_ENDPOINT",
            format!("http://{address}/chat/completions"),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = chat.spawn().unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"durable question\n")
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(String::from_utf8_lossy(&output.stdout).contains("durable-answer"));
    server.join().unwrap();

    let listing = pho()
        .args(["session", "list"])
        .env("HOME", home.path())
        .output()
        .unwrap();
    assert!(listing.status.success());
    let listing = String::from_utf8(listing.stdout).unwrap();
    let session_id = listing.split_whitespace().next().unwrap();
    assert_eq!(session_id.len(), 36);
    assert!(listing.contains("ready"));
    assert!(!listing.contains(".jsonl"));

    let resumed = pho()
        .args(["session", "resume", session_id])
        .env("HOME", home.path())
        .env("PHO_CODE_TEST_MEMORY_CREDENTIALS", "missing")
        .output()
        .unwrap();
    assert!(
        resumed.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&resumed.stderr)
    );
    let transcript = String::from_utf8(resumed.stdout).unwrap();
    assert!(transcript.contains("durable question"));
    assert!(transcript.contains("durable-answer"));

    let rejected = pho()
        .args(["session", "resume", "../session.jsonl"])
        .env("HOME", home.path())
        .output()
        .unwrap();
    assert_eq!(rejected.status.code(), Some(2));
}
