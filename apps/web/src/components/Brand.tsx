import logo from '../assets/logo.jpg';

export function Brand() {
  return (
    <div className="brand">
      <img className="logo" src={logo} alt="" width="40" height="40" />
      <span className="bn">Mente Ativa</span>
    </div>
  );
}
