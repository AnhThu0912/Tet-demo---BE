module.exports = [
    {
        ignores: ["node_modules/**", "dist/**", "build/**"],
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: {
                // Node/CommonJS globals
                require: "readonly",
                module: "readonly",
                exports: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                process: "readonly",
                Buffer: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
            },
        }, rules: {
            "no-undef": "error",
            "no-unused-vars": "warn",
            "no-console": "off",
        },
    },
];