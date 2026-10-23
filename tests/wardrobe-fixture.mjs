export async function selectPerson(page,id){
 for(let i=0;i<2;i++){if(await page.locator('#looks-people').isVisible())break;await page.locator('#looks-back').tap();}
 await page.locator('[data-person="'+id+'"]').tap();await page.locator('#looks-add-skin:enabled').waitFor();
}
export async function editSkin(page,id='default'){await page.locator('.looks-skin-card[data-skin="'+id+'"]').getByRole('button',{name:'编辑',exact:true}).tap();await page.locator('#looks-portrait-panel').waitFor();}
export async function addSkin(page,name){await page.locator('#looks-add-skin').tap();await page.locator('#looks-name-input').fill(name);await page.locator('#looks-name-dialog button[type=submit]').tap();await page.locator('#looks-editor').waitFor();return page.locator('#world-looks-dialog').getAttribute('data-skin');}

export async function openAtlasOptions(page,prefix='looks'){
 const root=page.locator('#'+(prefix==='looks'?'looks-walk-editor':'looks-action-editor')+' .looks-import-advanced');
 if(await root.getAttribute('open')===null)await root.locator(':scope > summary').tap();
}
