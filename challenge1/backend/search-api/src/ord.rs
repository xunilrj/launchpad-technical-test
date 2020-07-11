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

#[cfg(test)]
mod test {
    use super::*;
    #[quickcheck]
    fn cmp_ord_first_must_follow_first_item(a: i32, b: i32) -> bool {
        a.cmp(&b) == OrdFirst(a, 0).cmp(&OrdFirst(b, 0))
    }
    #[quickcheck]
    fn partial_cmp_ord_first_must_follow_first_item(a: i32, b: i32) -> bool {
        a.partial_cmp(&b) == OrdFirst(a, 0).partial_cmp(&OrdFirst(b, 0))
    }
    #[quickcheck]
    fn eq_ord_first_must_follow_first_item(a: i32, b: i32) -> bool {
        a.eq(&b) == OrdFirst(a, 0).eq(&OrdFirst(b, 0))
    }
}
