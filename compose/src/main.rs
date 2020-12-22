use harmonizer::{ServiceDefinition, ServiceList, harmonize};

fn main() {
    let mut service_list: ServiceList = Vec::new();

    // I mean, using real data here would be key.
    service_list.push(ServiceDefinition {
    name: "User",
    url: "http://user-service",
    type_defs: r#"
        type User {
        firstname: String!
        }

        type Query {
        getUser: User!
        }
    "#,
    });

    harmonize(service_list);
}
