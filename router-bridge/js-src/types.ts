export type OperationResult =
  | { Ok: any; Err?: undefined }
  | { Ok?: undefined; Err: any };
