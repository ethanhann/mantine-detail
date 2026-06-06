declare module "*.module.css" {
	const classes: Record<string, string>;
	export default classes;
}

// Side-effect CSS imports (e.g. a dependency's bundled stylesheet).
declare module "*.css";
