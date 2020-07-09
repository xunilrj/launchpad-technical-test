use std::cmp::Ordering;

#[derive(Debug)]
pub struct OrdFirst<TA, TB>(pub TA, pub TB);

impl<TA: Ord, TB> Ord for OrdFirst<TA, TB> {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0.cmp(&other.0)
    }
}

impl<TA: PartialOrd, TB> PartialOrd for OrdFirst<TA, TB> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        self.0.partial_cmp(&other.0)
    }
}

impl<TA: Eq, TB> Eq for OrdFirst<TA, TB> {}

impl<TA: PartialEq, TB> PartialEq for OrdFirst<TA, TB> {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}
