<?
echo $miner['name'];

echo $form->create('Miner', array('url' => '/admins/reset_password/'.$miner['id']));
echo $form->input('id', array('type' => 'hidden', 'value' => $miner['id']));
echo $form->end('Reset Password');

if (isset($message))
	echo $message;

?>