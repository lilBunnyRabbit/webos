import React from "react";

export default function TestApp() {
  const [seconds, setSeconds] = React.useState(0);

  React.useEffect(() => {
    console.log("~~~~~~~~~~~~~~~ TestApp mounted");
    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div>TestApp</div>
      <div>Seconds elapsed: {seconds}</div>
    </div>
  );
}
