import { createContext, useContext, useState, useEffect } from "react";
import api from "../services/api";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check token on load
    const token = localStorage.getItem("truststream-token");
    if (token) {
      api.get("/auth/verify", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          setIsAuthenticated(true);
          setUsername(res.data.username);
        })
        .catch(() => {
          localStorage.removeItem("truststream-token");
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const res = await api.post("/auth/login", { username, password });
    localStorage.setItem("truststream-token", res.data.token);
    setIsAuthenticated(true);
    setUsername(res.data.username);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem("truststream-token");
    setIsAuthenticated(false);
    setUsername(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}