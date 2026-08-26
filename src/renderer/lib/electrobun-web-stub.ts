type RemoteRequest = { params: unknown; response: unknown };

type RemoteRequests<Schema> = Schema extends {
  bun: { requests: infer Requests extends Record<string, RemoteRequest> };
}
  ? Requests
  : never;

type RequestClient<Schema> = {
  [Method in keyof RemoteRequests<Schema>]: (
    params: RemoteRequests<Schema>[Method]["params"],
    options?: { maxRequestTime?: number },
  ) => Promise<RemoteRequests<Schema>[Method]["response"]>;
};

export class Electroview {
  readonly runtime = "web-stub";

  static defineRPC<Schema>(_configuration: unknown): { request: RequestClient<Schema> } {
    return {
      request: new Proxy({} as RequestClient<Schema>, {
        get: () => () => Promise.reject(new Error("Electrobun RPC is unavailable in the web app.")),
      }),
    };
  }
}
