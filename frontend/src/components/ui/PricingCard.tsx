import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Typography,
  Button,
} from "@material-tailwind/react";
export function PricingCard({ title, symbol, imageUrl, avatarUrl, priceSol, tokenMint, tweetLink, username, solPrice, mcap }: { title: string, symbol: string, imageUrl: string, avatarUrl: string, priceSol: number, tokenMint: string, tweetLink: string, username: string, solPrice: number, mcap: number }) {
  const router = useRouter();
  console.log("mcap", mcap);
  const maskUsername = (username: string) => {
    if (username.length <= 6) return username;
    return `${username.slice(0, 3)}...${username.slice(-3)}`;
  };
  return (
    // <div className="w-full h-full bg-primary-gradient ">
    <>
      {/*@ts-ignore*/}
      <Card color="gray" variant="gradient" className="w-full max-w-2xl p-6">
        {/* Main content area */}
        {/*@ts-ignore*/}
        <CardBody className="flex flex-col gap-4 p-0">
          {/* Header with image */}
          <div className="relative w-full rounded-lg overflow-hidden group">
            <a
              href={tweetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full h-full"
            >
              <img
                src={imageUrl}
                alt="Tweet img"
                className="w-full h-full object-cover transition-all duration-300 group-hover:scale-105 group-hover:brightness-110"
              />
            </a>
          </div>

          {/* Text and image container */}
          <div className="flex justify-between items-center">
            <div className="flex flex-col gap-2">
              <p className="text-base text-white font-bold">
                {title} (${symbol})
              </p>
              {mcap !== 0 ? <p className="text-sm font-normal text-green-500">
                Market Cap: ${(mcap*solPrice).toFixed(2).toString()}
              </p> : <p className="text-sm font-normal text-green-500">
                Market Cap: ${(25 * solPrice).toFixed(2).toString()}
              </p>}
            </div>

            {/* Square image */}
            <a
              href={tweetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1 group"
            >
              <div className="relative w-8 h-8 rounded overflow-hidden">
                <img
                  src={avatarUrl}
                  alt="pfp icon"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-xs text-gray-400 group-hover:underline">
                By:@{username ? maskUsername(username) : "Anonymous"}
              </span>
            </a>
          </div>
        </CardBody>

        {/* Footer with button */}
        {/* Footer with buttons */}
        <div className="flex gap-2 mt-6">
          {/* Footer with button */}
          {/*@ts-ignore*/}
          {/* <Button
          size="md"
          color="white"
          className="hover:scale-[1.02] focus:scale-[1.02] active:scale-100 mt-6"
          ripple={false}
          fullWidth={true}
          onClick={() => router.push(`/coin?tokenMint=${tokenMint}`)}
        >
          Trade this tweet
        </Button> */}

          {/*@ts-ignore*/}
          <Button
            size="md"
            color="green"
            className="hover:scale-[1.02] focus:scale-[1.02] active:scale-100 flex-1"
            ripple={false}
            onClick={() => router.push(`/coin?tokenMint=${tokenMint}&action=BUY`)}
          >
            Buy this tweet
          </Button>
          {/*@ts-ignore*/}
          <Button
            size="md"
            color="red"
            className="hover:scale-[1.02] focus:scale-[1.02] active:scale-100 flex-1"
            ripple={false}
            onClick={() => router.push(`/coin?tokenMint=${tokenMint}&action=SELL`)}
          >
            Sell this tweet
          </Button>
        </div>
      </Card>
    </>
    // </div>
  );
}