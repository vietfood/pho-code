use std::time::Duration;

use tokio::io::AsyncWriteExt as _;
use tokio::net::TcpListener;

pub struct LoopbackFixture {
    pub address: std::net::SocketAddr,
    task: tokio::task::JoinHandle<()>,
}

impl LoopbackFixture {
    pub async fn fragmented(chunks: Vec<Vec<u8>>, delay: Duration) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            for chunk in chunks {
                stream.write_all(&chunk).await.unwrap();
                if !delay.is_zero() {
                    tokio::time::sleep(delay).await;
                }
            }
        });
        Self { address, task }
    }

    pub async fn finish(self) {
        self.task.await.unwrap();
    }
}
