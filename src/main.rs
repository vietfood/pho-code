#[tokio::main]
async fn main() {
    let command = match pho_code::cli::command::parse(std::env::args().skip(1)) {
        Ok(command) => command,
        Err(message) => {
            eprintln!("pho: {message}");
            std::process::exit(2);
        }
    };
    std::process::exit(pho_code::cli::run(command).await);
}
