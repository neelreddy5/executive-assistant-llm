import type { ExecutiveContext } from "./types";

export const initialExecutiveContext: ExecutiveContext = {
  profile: {
    name: "Alex Morgan",
    title: "COO",
    timezone: "America/New_York",
  },
  contacts: [
    { name: "Sarah Chen", title: "Board member", email: "sarah.chen@example.com" },
    { name: "James Wilson", title: "VP Finance", email: "james.wilson@example.com" },
  ],
  preferences: {},
  onboardingComplete: false,
};
