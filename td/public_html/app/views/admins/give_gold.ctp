<?
echo $form->create(null, array('url' => '/admins/give_gold/'));
echo $form->input('Miner.miner_id', array('type' => 'text'));
echo $form->input('Miner.gold');
echo $form->end('Give');
if (isset($message))
	echo $message;

?>