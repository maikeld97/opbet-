import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletConnectProvider } from '@btc-vision/walletconnect';
import { Navigation } from './components/Navigation.js';
import { Home } from './pages/Home.js';
import { MarketDetail } from './pages/MarketDetail.js';
import { Portfolio } from './pages/Portfolio.js';
import { Deploy } from './pages/Deploy.js';
import { AdminSeed } from './pages/AdminSeed.js';
import { EventGroupDetail } from './pages/EventGroupDetail.js';
import './styles.css';

export function App(): React.ReactElement {
    return (
        <WalletConnectProvider theme="dark">
            <BrowserRouter>
                <Navigation />
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/market/:id" element={<MarketDetail />} />
                    <Route path="/portfolio" element={<Portfolio />} />
                    <Route path="/deploy" element={<Deploy />} />
                    <Route path="/admin/seed" element={<AdminSeed />} />
                    <Route path="/event/:slug" element={<EventGroupDetail />} />
                </Routes>
            </BrowserRouter>
        </WalletConnectProvider>
    );
}
