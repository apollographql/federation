use apollo_stargate::common::Opt;
use apollo_stargate::Stargate;
use apollo_stargate_tide::{get_studio_middleware, RequestExt, ResponseExt};
use std::fs;
use tide::{Request, Response, StatusCode};

#[derive(Clone)]
struct ServerState<'app> {
    stargate: Stargate<'app>,
}

static mut MANIFEST: String = String::new();

#[async_std::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tide::log::start();

    let opt = Opt::default();
    /*

        The current problem as I understand it is tide requires state to implement
        the 'static lifetime (i.e. be around for the entire application lifecycle).
        However, we need to read a file from the filesystem and parse it into a schema
        before giving state to tide. This parsed document does live as long as the `main`
        function but I can't figure out how to tell Rust that it meets the lifetimes needs
        (maybe it doesn't!).

        Since the parser requires a lifetime instead of taking ownership of the string, in
        order to use the schema within the the request state we have to make it static
        somehow :(

    */
    let stargate = unsafe {
        MANIFEST = fs::read_to_string(&opt.manifest)?;
        Stargate::new(&MANIFEST)
    };

    let mut server = tide::with_state(ServerState { stargate });
    // allow studio
    server.with(get_studio_middleware());
    server.with(tide_compress::CompressMiddleware::new());

    server
        .at("/")
        .post(|mut req: Request<ServerState<'static>>| async move {
            let request_context = req.build_request_context().await?;
            let state = req.state();
            let resp = state.stargate.execute_query(&request_context).await;
            Response::new(StatusCode::Ok).format_graphql_response(resp)
        });

    server.listen(opt.address).await?;
    Ok(())
}
