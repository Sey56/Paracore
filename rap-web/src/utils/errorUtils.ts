import axios, { AxiosError, AxiosResponse } from 'axios';

interface CustomAxiosResponseData {
  detail: string;
}

interface AxiosErrorWithResponseData extends AxiosError {
  response: AxiosResponse<CustomAxiosResponseData>;
}

export function isAxiosErrorWithResponseData(error: unknown): error is AxiosErrorWithResponseData {
  return axios.isAxiosError(error) &&
         error.response !== undefined &&
         error.response.data !== undefined &&
         (error.response.data as CustomAxiosResponseData).detail !== undefined;
}
