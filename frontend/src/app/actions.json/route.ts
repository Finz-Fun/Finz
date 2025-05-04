import { ACTIONS_CORS_HEADERS, ActionsJson } from "@solana/actions";

export const GET = async () => {
  const payload: ActionsJson = {
    rules: [
      {
        pathPattern: "/blinks/*",
        apiPath: `https://api.finz.fun/blinks/*`,
      },
      {
        pathPattern: "/api/blinks/**",
        apiPath: `https://api.finz.fun/api/blinks/**`,
      }
    ],
  };

  return Response.json(payload, {
    headers: ACTIONS_CORS_HEADERS,
  });
};

export const OPTIONS = GET;