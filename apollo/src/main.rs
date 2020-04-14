use serde_json::json;

fn main() {
    let message = json!({
        "message": "hello world"
    });

    println!("{}", message.to_string());
}
