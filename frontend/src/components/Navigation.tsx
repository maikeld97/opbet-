import { NavLink } from 'react-router-dom';
import { WalletButton } from './WalletButton.js';

export function Navigation(): React.ReactElement {
    return (
        <nav className="nav">
            <div className="nav__inner">
                <NavLink to="/" className="nav__logo">
                    OPBET
                </NavLink>

                <div className="nav__links">
                    <NavLink
                        to="/"
                        className={({ isActive }) => `nav__link ${isActive ? 'active' : ''}`}
                        end
                    >
                        Markets
                    </NavLink>
                    <NavLink
                        to="/portfolio"
                        className={({ isActive }) => `nav__link ${isActive ? 'active' : ''}`}
                    >
                        Portfolio
                    </NavLink>
                </div>

                <WalletButton />
            </div>
        </nav>
    );
}
