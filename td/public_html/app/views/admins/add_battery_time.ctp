Input delta time in hours:
<?
echo $form->create(null, array('controller' => 'admins', 'action' => 'add_battery_time'));
echo $form->input('Miner.deltaTime', array('type' => 'text'));
echo $form->end('Add');
if (isset($message))
	echo $message;
?>
