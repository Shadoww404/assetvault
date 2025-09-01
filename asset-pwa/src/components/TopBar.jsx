import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../app/store";

export default function TopBar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <AppBar position="sticky" elevation={0} color="inherit" sx={{ borderBottom: "1px solid #eee" }}>
      <Toolbar sx={{ gap: 2 }}>
        <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>Asset Manager</Typography>
        <Stack direction="row" spacing={1}>
          <Button component={NavLink} to="/items" color="inherit">Assets</Button>
          {user ? (
            <Button onClick={() => { logout(); nav("/login"); }} variant="outlined">Logout</Button>
          ) : (
            <Button component={NavLink} to="/login" variant="contained">Login</Button>
          )}
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
