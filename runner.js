const { importFromCurseforge, verifyModpackIntegrity, importFromModrinth, createPack } = require("./src");

async function run() {
   //let out = await importFromCurseforge("C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks_cache\\6a4b92de5f2b721766205a1f-endles-49k4wqo5.zip", "C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks", "testrunner")
   //let out = await importFromModrinth("C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks_cache\\pixel.mrpack", "C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks", "testrunnermodrinth")

   //let out = await verifyModpackIntegrity("C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks\\testrunnermodrinth")
   let payload = {
      name: 'testcustomcmm',
      loader: 'forge',
      minecraftVersion: '1.7.10',
      author: 'cmm',
      mods: [{
         source: 'cf',
         slug: 'journeymap'
      }, {
         source: 'mr',
         slug: 'biomes-o-plenty'
      }]
   }
   let out = await createPack(payload, "C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks", "C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\config\\packwiz\\packwiz.exe")
   console.log(out)
}

run()