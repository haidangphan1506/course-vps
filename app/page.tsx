import ApiChecklist from "@/components/api-checklist/ApiChecklist";
import CourseApp from "@/components/course/CourseApp";
import Dashboard from "./Dashboard";
import Results from "./results/Results";

export default function Home() {
  return (
    <Dashboard panels={{ course: <CourseApp />, api: <ApiChecklist />, results: <Results /> }} />
  );
}
