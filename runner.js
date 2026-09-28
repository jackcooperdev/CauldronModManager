
const { importFromFolder, createPack, addMods, removeMods } = require("./src/controllers/packManager");

async function run() {

   let payload = {
      name: 'testcustomcmm',
      loader: 'forge',
      minecraftVersion: '1.7.10',
      author: 'cmm',
      mods: [{
         source: 'cf',
         slug: 'journeymap'
      },
      {
         source: 'mr',
         slug: 'biomes-o-plenty'
      }]
   }
   try {
      let out;
      let run = process.argv[2];
     /*  if (run === 'cf') {
         out = await importFromFolder("C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks_cache\\test.zip", "C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks", "testrunner")

      } else {
         out = await importFromFolder("C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks_cache\\pixel.mrpack", "C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks", "testrunnermodrinth")
      } */


      //let out = await verifyModpackIntegrity("C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks\\testcustomcmm")
      //out = await createPack(payload, "C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks")
      //out = await addMods("C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks\\testcustomcmm",[{source:'mr',slug:'wawla'}])
      out = await removeMods("C:\\Users\\sdn\\projects\\cauldron\\.cauldron\\modpacks\\testcustomcmm",[{source:'cf',slug:'mekanism'},{source:'cf',slug:'security-craft'}])
      console.log(out)
   } catch (e) {
      console.log(e)
   }

}

run()