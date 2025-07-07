import React from 'react';
import ReactDOM from 'react-dom/client';
import {createGlobalStyle, ThemeProvider} from 'styled-components';
import {styleReset} from 'react95';
// @ts-ignore
import original from 'react95/dist/themes/original';
// @ts-ignore
import themes from 'react95/dist/themes';
// @ts-ignore
import ms_sans_serif from 'react95/dist/fonts/ms_sans_serif.woff2';
// @ts-ignore
import ms_sans_serif_bold from 'react95/dist/fonts/ms_sans_serif_bold.woff2';
import App from './App';

const GlobalStyles = createGlobalStyle`
  @font-face {
    font-family: 'ms_sans_serif';
    src: url('${ms_sans_serif}') format('woff2');
    font-weight: 400;
    font-style: normal
  }
  @font-face {
    font-family: 'ms_sans_serif';
    src: url('${ms_sans_serif_bold}') format('woff2');
    font-weight: bold;
    font-style: normal
  }
  #root {
    font-family: 'ms_sans_serif';
  }
  ${styleReset}
`;

function Root() {
  const [themeName, setThemeName] = React.useState(
    localStorage.getItem('theme') || 'original',
  );
  // @ts-ignore
  const theme = (themes as any)[themeName] || original;

  const handleChange = React.useCallback((name: string) => {
    setThemeName(name);
    localStorage.setItem('theme', name);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <App themeName={themeName} setThemeName={handleChange} />
    </ThemeProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <div>
      <GlobalStyles />
      <Root />
    </div>
  </React.StrictMode>
);
