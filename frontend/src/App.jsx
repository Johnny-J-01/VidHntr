import ClipForge from "./pages/ClipForge.jsx";
import SignIn from "./pages/SignIn.jsx";
import SignUp from "./pages/SignUp.jsx";

export default function App() {
	const pathname = window.location.pathname;

	if (pathname === "/signin") {
		return <SignIn />;
	}

	if (pathname === "/signup") {
		return <SignUp />;
	}

	return <ClipForge />;
}
