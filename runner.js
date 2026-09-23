const { importFromCurseforge } = require("./src");

async function run() {
   let out = await importFromCurseforge("C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks_cache\\6a4b92de5f2b721766205a1f-endles-49k4wqo5.zip","C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks","testrunner") 
   console.log(out)
}

run()