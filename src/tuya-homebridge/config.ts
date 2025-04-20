export const ProjectTypeCustom = "1";
export const ProjectTypePaaS = "2";

export type Config = {
  username: string;
  password: string;
  accessId: string;
  accessKey: string;
  lang: "en";
  projectType: "1" | "2"; // PaaS = 2, Custom = 1
  appSchema: "tuyaSmart" | "smartlife"; // tuyaSmart | smartlife
  countryCode: 86 | 61;
  debug: boolean;
};
