<div id="fullcenter">


<? 
echo $form->create('TutorialStage', array('url' => '/admins/edit_tutorial'));
for($stage = 0; $stage < $stageCount; $stage++)
{
	echo $form->input("TutorialStage.$stage.id", array('type' => 'text')); // last stage is a new stage with no id
	echo $form->input("TutorialStage.$stage.name");
	echo $form->input("TutorialStage.$stage.title");
	echo $form->textarea("TutorialStage.$stage.instructions", array('cols' => 90, 'rows' => 4));
	echo $form->input("TutorialStage.$stage.trigger_url");
	echo "<BR>";
}
echo $form->end('Submit');

echo $html->link('create', '/admins/edit_tutorial/1');

?>

</div>