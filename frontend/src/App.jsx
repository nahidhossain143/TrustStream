import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import VideoDetail from "./pages/VideoDetail";
import ImageDetail from "./pages/ImageDetail";
import TimelinePage from "./pages/TimeLinePage";
import { ThemeProvider } from "./context/ThemeContext";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env");
}

function ProtectedAdmin() {
  return (
    <>
      <SignedIn>
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
