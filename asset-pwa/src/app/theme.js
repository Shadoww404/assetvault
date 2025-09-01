import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#0f172a" },
    secondary: { main: "#2563eb" },
    background: { default: "#f7f7fb" },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: { styleOverrides: { root: { textTransform: "none", borderRadius: 10 } } },
    MuiCard:   { styleOverrides: { root: { borderRadius: 16 } } },
  },
});

export default theme;
