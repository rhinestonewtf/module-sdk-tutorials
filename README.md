# ModuleSDK tutorials

This repo consists of various tutorials using the [ModuleSDK](https://docs.rhinestone.wtf/module-sdk). Many of them are written up as guides in our docs to provide more information about why certain things are done.

## Using this repo

### Structure

All guides are in the `src` folder and are grouped by module name. Within these folders, there might be different flavours of guides, such as depending on which sdks and account types are used.

### Running tests

To run the tests yourself, you will first need to install the dependencies, such as using `pnpm i`. Then, you will need to run `docker-compose up` to run the local testnet. In some cases, the tests require using a hosted testnet so you will need to add the appropriate values to the `.env` file based on the `.env.example`.

Finally, uncomment the tests you want to run in `test/main.test.ts` and run `pnpm test`.
