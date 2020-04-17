import { mockGlobal } from './mock'
import fetchMock from 'fetch-mock'
jest.mock('./sentry')

const GITHUB_RELEASE = "https://github.com/apollographql/apollo-cli/releases";
beforeEach(() => {
    mockGlobal()
    jest.resetModules();
});

afterEach(fetchMock.resetBehavior)
it('returns an index.html file if bare url is requested', async () => {
    require('./index');
    const request = new Request('/');
    const response: any = await self.trigger('fetch', request);
    expect(response.status).toEqual(200);
    expect(await response.text()).toEqual('index.html')
})

it('returns an 404.html file if unsupported url is requested', async () => {
    require('./index');
    const request = new Request('/foo');
    const response: any = await self.trigger('fetch', request);
    expect(response.status).toEqual(404);
    expect(await response.text()).toEqual('404.html')
})

it('returns an install.sh file if navigating to /cli', async () => {
    require('./index');
    const request = new Request('/cli');
    const response: any = await self.trigger('fetch', request);
    expect(response.status).toEqual(200);
    expect(await response.text()).toEqual('install cli')
    expect(response.headers.get('content-type')).toEqual('application/x-sh')
})


it('pulls from the latest tag in GitHub if no version is passed', async () => {
    fetchMock.get(`${GITHUB_RELEASE}/latest`, {
        redirectUrl: "https://github.com/apollographql/apollo-cli/releases/tag/v0.0.1"
    })

    fetchMock.get(`${GITHUB_RELEASE}/download/v0.0.1/apollo-v0.0.1-x86_64-linux.tar.gz`, {
        body: 'binary file'
    })

    require('./index');
    const request = new Request('/cli/linux');
    const response: any = await self.trigger('fetch', request);
    expect(response.status).toEqual(200);
    expect(await response.text()).toEqual('binary file')
})

it('pulls from a version if passed', async () => {
    fetchMock.get(`${GITHUB_RELEASE}/download/v0.0.1/apollo-v0.0.1-x86_64-linux.tar.gz`, {
        body: 'binary file'
    })

    require('./index');
    const request = new Request('/cli/linux/0.0.1');
    const response: any = await self.trigger('fetch', request);
    expect(response.status).toEqual(200);
    expect(await response.text()).toEqual('binary file')
})

it('returns a 500 if GitHub is down', async () => {
    fetchMock.get(`${GITHUB_RELEASE}/latest`, 500)
    require('./index');
    const { log } = require('./sentry')

    const request = new Request('/cli/linux');
    const response: any = await self.trigger('fetch', request);
    expect(response.status).toEqual(500);
    expect(log).toHaveBeenCalled()
    expect(await response.text()).toEqual(`Error loading latest release for CLI at ${GITHUB_RELEASE}/latest`)
})

it('returns a 500 if asking for a bad version', async () => {
    fetchMock.get(`${GITHUB_RELEASE}/download/v0.0.1/apollo-v0.0.1-x86_64-linux.tar.gz`, 404)
    require('./index');
    const { log } = require('./sentry')

    const request = new Request('/cli/linux/0.0.1');
    const response: any = await self.trigger('fetch', request);
    expect(response.status).toEqual(500);
    expect(log).toHaveBeenCalled()
    expect(await response.text()).toEqual(`Couldn't find release for version 0.0.1 on linux`)
})

it('returns a 500 and message if something went really wrong', async () => {
    fetchMock.get(`${GITHUB_RELEASE}/download/v0.0.1/apollo-v0.0.1-x86_64-linux.tar.gz`, {
        status: 500,
    })
    require('./index');
    const { log } = require('./sentry')

    const request = new Request('/cli/linux/0.0.1');
    const response: any = await self.trigger('fetch', request);
    expect(response.status).toEqual(500);
    expect(log).toHaveBeenCalled()
    expect(await response.text()).toContain(`Error was Internal Server Error`)
})

it('logs internal server error and calls sentry on unexpected issue', async () => {
    jest.mock('./handler', () => {
        return {
            handleRequest: jest.fn(() => { throw new Error(':ohno:')})
        }
    })
    require('./index');
    const { log } = require('./sentry')
    const request = new Request('/');
    const response: any = await self.trigger('fetch', request);
    expect(log).toBeCalledWith(new Error(':ohno:'), request)
    expect(response.status).toEqual(500);
    expect(await response.text()).toEqual('Internal Server Error')
})