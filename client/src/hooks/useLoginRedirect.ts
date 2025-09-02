import { useLocation, useNavigate } from "react-router-dom";

export const useLoginRedirect = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const redirectToLogin = () => {
    navigate("/login", { state: { redirect: location.pathname + location.search } });
  };

  return { redirectToLogin };
};
