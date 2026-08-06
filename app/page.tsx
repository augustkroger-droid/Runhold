import { MissionApp } from "@/components/mission-app";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export default function Home() {
  return (
    <>
      <MissionApp />
      <ServiceWorkerRegister />
    </>
  );
}
