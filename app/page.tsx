import Dashboard from "./Dashboard";
import Results from "./results/Results";

export default function Home() {
  return <Dashboard results={<Results />} />;
}
