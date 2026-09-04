import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn, useClerk, useSession } from "@clerk/clerk-react";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import VideoDetail from "./pages/VideoDetail";
import ImageDetail from "./pages/ImageDetail";
import TimelinePage from "./pages/TimeLinePage";
import FabricAudit from "./pages/FabricAudit";
import PublicVerify from "./pages/PublicVerify";
import { ThemeProvider } from "./context/ThemeContext";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env");
}

// Clerk's development instance keeps its session on a separate accounts.dev
// origin, which does not reliably survive a reload on localhost -- it kicks you
// back to sign-in mid-demo. Set VITE_REQUIRE_ADMIN_AUTH=true to put the gate
// back for a real deployment.
const REQUIRE_ADMIN_AUTH =
  import.meta.env.VITE_REQUIRE_ADMIN_AUTH === "true";

const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Forces sign-out exactly 24h after this session started, independent of
// Clerk's own dashboard-configured session lifetime (which defaults to much
// longer). Recomputes the remaining time from session.createdAt on every
// mount, so a page reload doesn't reset the clock.
function AutoLogout() {
  const { session } = useSession();
  const { signOut } = useClerk();

  useEffect(() => {
    if (!session) return;

    const remaining = MAX_SESSION_AGE_MS - (Date.now() - new Date(session.createdAt).getTime());

    if (remaining <= 0) {
      signOut();
      return;
    }

    const timer = setTimeout(() => signOut(), remaining);
    return () => clearTimeout(timer);
  }, [session, signOut]);

  return null;
}

function ProtectedAdmin() {
  if (!REQUIRE_ADMIN_AUTH) return <Admin />;

  return (
    <>
      <SignedIn>
        <AutoLogout />
        <Admin />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

function App() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/video/:videoId" element={<VideoDetail />} />
            <Route path="/image/:imageId" element={<ImageDetail />} />
            <Route path="/timeline/:kind/:id" element={<TimelinePage />} />
            <Route path="/timeline/:id" element={<TimelinePage />} />
            <Route path="/fabric-audit" element={<FabricAudit />} />
            <Route path="/verify" element={<PublicVerify />} />
            <Route path="/admin" element={<ProtectedAdmin />} />
            <Route
              path="*"
              element={
                <div className="min-h-screen flex items-center justify-center">
                  <p>
                    Page not found. <a href="/">Go home</a>
                  </p>
                </div>
              }
            />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </ClerkProvider>
  );
}

export default App;
