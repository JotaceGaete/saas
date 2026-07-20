import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { recordRoute } from "lib/routeBreadcrumb";

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    recordRoute(pathname);
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default ScrollToTop;