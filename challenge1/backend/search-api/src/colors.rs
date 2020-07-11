use palette::Lab;

pub fn lab_distance(a: &Lab, b: &Lab) -> f32 {
    let x = a.l - b.l;
    let y = a.a - b.a;
    let z = a.b - b.b;
    (x * x + y * y + z * z).sqrt()
}

#[cfg(test)]
mod test {
    use super::*;
    use float_eq::float_eq;
    use palette::{IntoColor, Srgb};
    #[quickcheck]
    fn lab_distance_never_negative(a: f32, b: f32, c: f32, d: f32, e: f32, f: f32) -> bool {
        let d = lab_distance(
            &Srgb::new(a, b, c).into_lab(),
            &Srgb::new(d, e, f).into_lab(),
        );
        d >= 0.0
    }

    #[quickcheck]
    fn lab_distance_same_color_must_return_zero(a: f32, b: f32, c: f32) -> bool {
        let d = lab_distance(
            &Srgb::new(a, b, c).into_lab(),
            &Srgb::new(a, b, c).into_lab(),
        );
        float_eq!(d, 0.0, abs <= 0.000_000_1)
    }

    #[quickcheck]
    fn lab_distance_is_commutative(a: f32, b: f32, c: f32, d: f32, e: f32, f: f32) -> bool {
        let lab1 = Srgb::new(a, b, c).into_lab();
        let lab2 = Srgb::new(d, e, f).into_lab();
        float_eq!(
            lab_distance(&lab1, &lab2),
            lab_distance(&lab2, &lab1),
            abs <= 0.000_000_1
        )
    }
}
