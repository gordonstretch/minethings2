<?
echo $miner['name'];

echo $form->create('Miner', array('url' => '/admins/trash_miner/'.$miner['id']));
echo $form->input('id', array('type' => 'hidden', 'value' => $miner['id']));
echo $form->end('Do It!');

?>