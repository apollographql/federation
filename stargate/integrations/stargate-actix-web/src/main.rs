use actix_cors::Cors;
use actix_web::{middleware, post, web, App, HttpResponse, HttpServer, Result};
use apollo_stargate::common::Opt;
use apollo_stargate::transports::http::{GraphQLRequest, RequestContext, ServerState};
use apollo_stargate::Stargate;
use std::fs;

#[post("/")]
async fn index(
    request: web::Json<GraphQLRequest>,
    stargate: web::Data<&Stargate<'static>>,
) -> Result<HttpResponse> {
    let context = RequestContext {
        graphql_request: request.into_inner(),
    };
    let result = match stargate.execute_query(&context).await {
        Ok(result) => result,
        Err(_) => todo!("handle error cases when executing query"),
    };
    Ok(HttpResponse::Ok().json(result))
}

static mut MANIFEST: String = String::new();

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let opt = Opt::default();
    let stargate = unsafe {
        MANIFEST = fs::read_to_string(&opt.manifest)?;
        Stargate::new(&MANIFEST)
    };
    let stargate = web::Data::new(ServerState { stargate });

    HttpServer::new(move || {
        let cors = Cors::new()
            .allowed_methods(vec!["GET", "POST", "OPTIONS"])
            .allowed_origin("https://studio.apollographql.com")
            .supports_credentials()
            .finish();

        App::new()
            .wrap(middleware::Compress::default())
            .wrap(cors)
            .data(stargate.clone())
            .service(index)
    })
    .bind(format!("127.0.0.1:{}", opt.address))?
    .run()
    .await
}
