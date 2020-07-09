use palette::Lab;

pub fn lab_distance(a: &Lab, b: &Lab) -> f32 {
    let x = a.l - b.l;
    let y = a.a - b.a;
    let z = a.b - b.b;
    (x * x + y * y + z * z).sqrt()
}
