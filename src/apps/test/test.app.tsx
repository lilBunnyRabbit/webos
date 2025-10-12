import React from "react";

interface TestAppProps {
  random: number;
}

export default function TestApp(props: TestAppProps = { random: 0 }) {
  const [seconds, setSeconds] = React.useState(0);

  React.useEffect(() => {
    console.log("~~~~~~~~~~~~~~~ TestApp mounted", props);
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
