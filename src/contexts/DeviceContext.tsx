import { createContext, useContext, ReactNode } from "react";
import { useState, useEffect } from "react";

// Step 1: Create the DeviceContext and its type
type DeviceContextType = {
  deviceType: "mobile" | "tablet" | "desktop";
};

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

// Step 2: Create the Hook (useDeviceType)
const useDeviceType = () => {
  const [deviceType, setDeviceType] = useState<"mobile" | "tablet" | "desktop">("desktop");

  useEffect(() => {
    const userAgent = navigator.userAgent; // Keep casing in original form

    if (/iPhone|Android.*Mobile|BlackBerry|Nokia|webOS|Opera Mini|Windows Phone/i.test(userAgent)) {
      setDeviceType("mobile"); // Phones
    } else if (/iPad|Android(?!.*Mobile)|Tablet|Silk/i.test(userAgent)) {
      setDeviceType("tablet"); // Tablets
    } else {
      setDeviceType("desktop"); // Default to desktop
    }
  }, []);

  return deviceType;
};

// Step 3: Create the Provider Component
export const DeviceProvider = ({ children }: { children: ReactNode }) => {
  const deviceType = useDeviceType();

  return <DeviceContext.Provider value={{ deviceType }}>{children}</DeviceContext.Provider>;
};

// Step 4: Create a custom hook to consume the context
export const useDeviceContext = (): DeviceContextType => {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error("useDeviceContext must be used within a DeviceProvider");
  }
  return context;
};
