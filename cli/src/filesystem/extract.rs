use flate2;
use std::fs::File;
use std::io::{Error, ErrorKind};
use std::path::Path;
use tar;

#[derive(Debug)]
pub struct Extract<'a> {
    source: &'a Path,
}

impl<'a> Extract<'a> {
    /// Create an `Extract`or from a source path
    pub fn from_source(source: &'a Path) -> Extract<'a> {
        Self { source }
    }

    /// Extract a single file from a source and save to a file of the same name in `into_dir`.
    /// If the source is a single compressed file, it will be saved with the name `file_to_extract`
    /// in the specified `into_dir`.
    pub fn extract_file<T: AsRef<Path>>(
        &self,
        into_dir: &Path,
        file_to_extract: T,
    ) -> Result<(), Error> {
        let file_to_extract = file_to_extract.as_ref();
        let source = File::open(self.source)?;

        let reader = flate2::read::GzDecoder::new(source);
        let mut archive = tar::Archive::new(reader);
        let mut entry = archive
            .entries()?
            .filter_map(|e| e.ok())
            .find(|e| e.path().ok().filter(|p| p == file_to_extract).is_some())
            .ok_or_else(|| {
                Error::new(
                    ErrorKind::Other,
                    format!(
                        "Could not find the required path in the archive: {:?}",
                        file_to_extract
                    ),
                )
            })?;
        entry.unpack_in(into_dir)?;

        Ok(())
    }
}
