<?
echo $form->create(null, array('url' => '/admins/give_credits/'));
echo $form->input('Miner.miner_id');
echo $form->input('Miner.credits');
echo $form->end('Give');
if (isset($message))
	echo $message;

?>