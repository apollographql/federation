use indicatif::{ProgressBar, ProgressStyle};
use reqwest::header;
use std::cmp::min;
use std::error::Error;
use std::io;

/// Download things into files with optional progress bar
#[derive(Debug)]
pub struct Download {
    show_progress: bool,
    url: String,
    headers: reqwest::header::HeaderMap,
    progress_style: ProgressStyle,
}
impl Download {
    /// Specify download url
    pub fn from_url(url: &str) -> Self {
        Self {
            show_progress: false,
            url: url.to_owned(),
            headers: reqwest::header::HeaderMap::new(),
            progress_style: ProgressStyle::default_bar()
                .template("[{elapsed_precise}] [{bar:40}] {bytes}/{total_bytes} ({eta}) {msg}")
                .progress_chars("=>-"),
        }
    }

    /// Toggle download progress bar
    pub fn show_progress(&mut self, b: bool) -> &mut Self {
        self.show_progress = b;
        self
    }

    /// Set the download request headers
    pub fn set_headers(&mut self, headers: reqwest::header::HeaderMap) -> &mut Self {
        self.headers = headers;
        self
    }

    /// Download the file behind the given `url` into the specified `dest`.
    /// Show a sliding progress bar if specified.
    /// If the resource doesn't specify a content-length, the progress bar will not be shown
    ///
    /// * Errors:
    ///     * `reqwest` network errors
    ///     * Unsuccessful response status
    ///     * Progress-bar errors
    ///     * Reading from response to `BufReader`-buffer
    ///     * Writing from `BufReader`-buffer to `File`
    pub fn download_to<T: io::Write>(&self, mut dest: T) -> Result<(), Box<dyn Error>> {
        use io::BufRead;
        let mut headers = self.headers.clone();
        if !headers.contains_key(header::USER_AGENT) {
            headers.insert(
                header::USER_AGENT,
                "rust-reqwest/self-update"
                    .parse()
                    .expect("invalid user-agent"),
            );
        }

        let resp = reqwest::blocking::Client::new()
            .get(&self.url)
            .headers(headers)
            .send()?;
        let size = resp
            .headers()
            .get(reqwest::header::CONTENT_LENGTH)
            .map(|val| {
                val.to_str()
                    .map(|s| s.parse::<u64>().unwrap_or(0))
                    .unwrap_or(0)
            })
            .unwrap_or(0);
        if !resp.status().is_success() {
            return Err(From::from(format!(
                "Download request failed with status: {:?}",
                resp.status()
            )));
        }
        let show_progress = if size == 0 { false } else { self.show_progress };

        let mut src = io::BufReader::new(resp);
        let mut downloaded = 0;
        let mut bar = if show_progress {
            let pb = ProgressBar::new(size);
            pb.set_style(self.progress_style.clone());

            Some(pb)
        } else {
            None
        };
        loop {
            let n = {
                let buf = src.fill_buf()?;
                dest.write_all(&buf)?;
                buf.len()
            };
            if n == 0 {
                break;
            }
            src.consume(n);
            downloaded = min(downloaded + n as u64, size);

            if let Some(ref mut bar) = bar {
                bar.set_position(downloaded);
            }
        }
        if let Some(ref mut bar) = bar {
            bar.finish_with_message("Done");
        }
        Ok(())
    }
}
