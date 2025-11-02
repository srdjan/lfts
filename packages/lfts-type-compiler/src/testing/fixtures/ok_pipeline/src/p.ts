import { asPipe, pipe } from "../../../../../../lfts-type-runtime/pipeline.ts";

const upper = asPipe((value: string) => value.toUpperCase());
const suffix = asPipe((value: string, marker: string) => `${value}${marker}`);

export const makeGreeting = (input: string) => {
  const token = pipe(input);
  token | upper | suffix("!");
  return token;
};
