pub trait Loggable {
    fn log_if_error(self) -> Self;
}

impl<T, TErr: std::fmt::Debug> Loggable for Result<T, TErr> {
    fn log_if_error(self) -> Self {
        match self {
            Err(err) => {
                log::error!(target: "dominant_color_cache", "{:?}", err);
                Err(err)
            }
            x @ _ => x,
        }
    }
}
